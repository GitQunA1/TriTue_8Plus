import { useState, useEffect } from 'react';
import { ref, onValue, push, set, update, remove } from 'firebase/database';
import { database } from '../firebase';
import { Class } from '../types';
import { toast } from 'react-toastify';
import { message } from 'antd';

export const useClasses = () => {
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const classesRef = ref(database, 'datasheet/Lớp_học');

        const unsubscribe = onValue(classesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const classList = Object.entries(data).map(([id, value]) => ({
                    id,
                    ...(value as Omit<Class, 'id'>)
                }));
                setClasses(classList);
            } else {
                setClasses([]);
            }
            setLoading(false);
        }, (error) => {
            console.error('Error fetching classes:', error);
            message.error('Không thể tải danh sách lớp học');
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const addClass = async (classData: Omit<Class, 'id'>) => {
        try {
            const classesRef = ref(database, 'datasheet/Lớp_học');
            const newClassRef = push(classesRef);
            await set(newClassRef, classData);
            message.success('Thêm lớp học thành công');
            return newClassRef.key;
        } catch (error) {
            console.error('Error adding class:', error);
            message.error('Không thể thêm lớp học');
            throw error;
        }
    };

    const updateClass = async (classId: string, updates: Partial<Omit<Class, 'id'>>) => {
        try {
            const classRef = ref(database, `datasheet/Lớp_học/${classId}`);
            await update(classRef, updates);
            message.success('Cập nhật lớp học thành công');
        } catch (error) {
            console.error('Error updating class:', error);
            message.error('Không thể cập nhật lớp học');
            throw error;
        }
    };

    const deleteClass = async (classId: string) => {
        try {
            const classRef = ref(database, `datasheet/Lớp_học/${classId}`);
            await remove(classRef);
            message.success('Xóa lớp học thành công');
        } catch (error) {
            console.error('Error deleting class:', error);
            message.error('Không thể xóa lớp học');
            throw error;
        }
    };

    const addStudentToClass = async (classId: string, studentId: string, studentName: string, enrollmentDate?: string) => {
        try {
            const classData = classes.find(c => c.id === classId);
            if (!classData) throw new Error('Class not found');

            const updatedStudentIds = [...(classData['Student IDs'] || []), studentId];
            const updatedStudentNames = [...(classData['Học sinh'] || []), studentName];
            
            // Track enrollment date - use provided date or default to today
            const dateToUse = enrollmentDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const updatedEnrollments = { ...(classData['Student Enrollments'] || {}) };
            updatedEnrollments[studentId] = { enrollmentDate: dateToUse };

            await updateClass(classId, {
                'Student IDs': updatedStudentIds,
                'Học sinh': updatedStudentNames,
                'Student Enrollments': updatedEnrollments
            });
        } catch (error) {
            console.error('Error adding student to class:', error);
            message.error('Không thể thêm học sinh vào lớp');
            throw error;
        }
    };

    const addMultipleStudentsToClass = async (
        classId: string,
        students: Array<{ id: string; name: string }>,
        enrollmentDate?: string
    ) => {
        try {
            const classData = classes.find(c => c.id === classId);
            if (!classData) throw new Error('Class not found');

            // Get current students
            const currentStudentIds = classData['Student IDs'] || [];
            const currentStudentNames = classData['Học sinh'] || [];
            const currentEnrollments = classData['Student Enrollments'] || {};

            // Filter out students that are already in the class
            const newStudents = students.filter(s => !currentStudentIds.includes(s.id));

            if (newStudents.length === 0) {
                message.info('Tất cả học sinh đã có trong lớp');
                return;
            }

            // Add new students
            const updatedStudentIds = [...currentStudentIds, ...newStudents.map(s => s.id)];
            const updatedStudentNames = [...currentStudentNames, ...newStudents.map(s => s.name)];
            
            // Track enrollment date for new students - use provided date or default to today
            const dateToUse = enrollmentDate || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const updatedEnrollments = { ...currentEnrollments };
            newStudents.forEach(s => {
                updatedEnrollments[s.id] = { enrollmentDate: dateToUse };
            });

            await updateClass(classId, {
                'Student IDs': updatedStudentIds,
                'Học sinh': updatedStudentNames,
                'Student Enrollments': updatedEnrollments
            });

            message.success(`Đã thêm ${newStudents.length} học sinh vào lớp (từ ngày ${dateToUse})`);
        } catch (error) {
            console.error('Error adding students to class:', error);
            message.error('Không thể thêm học sinh vào lớp');
            throw error;
        }
    };

    const removeStudentFromClass = async (classId: string, studentId: string) => {
        try {
            const classData = classes.find(c => c.id === classId);
            if (!classData) throw new Error('Class not found');

            const updatedStudentIds = (classData['Student IDs'] || []).filter(id => id !== studentId);
            const studentIndex = (classData['Student IDs'] || []).indexOf(studentId);
            const updatedStudentNames = (classData['Học sinh'] || []).filter((_, index) => index !== studentIndex);

            await updateClass(classId, {
                'Student IDs': updatedStudentIds,
                'Học sinh': updatedStudentNames
            });
        } catch (error) {
            console.error('Error removing student from class:', error);
            message.error('Không thể xóa học sinh khỏi lớp');
            throw error;
        }
    };

    return {
        classes,
        loading,
        addClass,
        updateClass,
        deleteClass,
        addStudentToClass,
        addMultipleStudentsToClass,
        removeStudentFromClass
    };
};
